// AdapterScript4_v1.js — Google Services Adapter para IAV Contratos v4.0
// Recibe POST desde Cloudflare Workers. No tiene UI propia.
// Solo maneja: Drive, Calendar, Gmail, PDF.
// Ultima modificacion: 2026-06-02 14:31:23 CST — R34: simplifica descripcion Calendar (procesarFirma, primerAbono, reagendarPropiedad); quita PDF/Drive/checklist/detalles internos

var CONFIG = {
  CARPETA_PROYECTOS_ID: '1PRZeVQr6cEgjkrso6eBPf9BA6dbv8XU3',
  TEMPLATE_CONTRATO_ID: '11NGZ2Tdxh3E2PdNAtuZ07EkOL9fu7w_KCHhXym8kwU4',
  TEMPLATE_RESIDENCIAL_ID: '1IoZ2dL_WoAlmDdQI2PuhUtYVujRknptwBUVD_ZJQH5A',
  TEMPLATE_TERRENO_ID: '1hNPqSLQq4br26LlUR4-Zc_lqZGxYl9-o6E-gk-uNo64',
  EMAIL_BRUNO: 'inmueblesaudiovisuales@gmail.com',
  WHATSAPP: 'https://wa.me/5218127174207',
  CLIP_LINK: 'https://linkdenegocio.mx/@inmueblesaudiovisuales/pagar',
  BANAMEX_CLABE: '002580905411451243',
  BANAMEX_CUENTA: '1145124',
  BANAMEX_TARJETA: '5544 9206 0686 5310',
  TITULAR: 'Bruno Gutierrez Salazar',
  SHEETS_BACKUP_ID: '1YLscbVQJEm_SF77lfiZXyDHc0_gy543P5yitPX_KpnY',
  ADMIN_KEY: 'framedock',
  WORKER_URL: 'https://contratos.inmueblesaudiovisuales.com'
};

// ── ENTRY POINT ─────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = body.action;
    var handlers = {
      procesarFirma: procesarFirma,
      primerAbono: primerAbono,
      enviarCorreoAbono: enviarCorreoAbono,
      enviarCorreoEntrega: enviarCorreoEntrega,
      reagendarPropiedad: reagendarPropiedad,
      subirArchivo: subirArchivo,
      subirArchivoAdmin: subirArchivoAdmin,
      notificarResena: notificarResena,
      notificarRevision: notificarRevision,
      enviarRecordatorioPago: enviarRecordatorioPago,
      notificarUpsell: notificarUpsell,
      obtenerLogoCliente: obtenerLogoCliente,
      syncBackup: syncBackup,
      agendarLlamadaProspecto: agendarLlamadaProspecto
    };
    if (!handlers[action]) return jsonResp({ error: 'Acción no reconocida: ' + action });
    var result = handlers[action](body);
    return jsonResp(result || { ok: true });
  } catch (err) {
    console.error('Adapter error:', err.message, err.stack);
    return jsonResp({ error: err.message });
  }
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── FIRMA — guarda PNG en Drive, genera PDF diferido ────────────────────────

function procesarFirma(body) {
  var token = body.token;
  var firmaBase64 = body.firmaBase64;
  var contrato = body.contrato;
  var linkPortal = body.linkPortal;

  var carpetaFirmas = obtenerOCrearCarpetaFirmas_();
  var b64 = firmaBase64.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'firma-' + token + '.png');
  var archFirma = carpetaFirmas.createFile(blob);
  archFirma.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Guardar referencia para generación diferida de PDF
  var props = PropertiesService.getScriptProperties();
  props.setProperty('pendiente_pdf_' + token, JSON.stringify({
    token: token,
    firmaId: archFirma.getId(),
    contrato: contrato,
    linkPortal: linkPortal,
    propiedades: body.propiedades || [],
    entregables: body.entregables || '',
    _creado: Date.now()
  }));

  // Crear carpetas de Drive + PDF referencias + eventos Calendar al momento de la firma
  var propiedades = body.propiedades || [];
  var folio = contrato.folio || token;
  try {
    var carpetaProyectos = DriveApp.getFolderById(CONFIG.CARPETA_PROYECTOS_ID);

    // Año y mes basados en la fecha de sesión (no en hoy)
    var fechaRef = (propiedades.length > 0 && propiedades[0].fecha_sesion)
      ? parseFecha_(propiedades[0].fecha_sesion) : new Date();
    var anioStr = fechaRef.getFullYear().toString();
    var nombresMes = ['01. Enero','02. Febrero','03. Marzo','04. Abril','05. Mayo','06. Junio',
                      '07. Julio','08. Agosto','09. Septiembre','10. Octubre','11. Noviembre','12. Diciembre'];
    var mesStr = nombresMes[fechaRef.getMonth()];

    var iterAnio = carpetaProyectos.getFoldersByName(anioStr);
    var carpetaAnio = iterAnio.hasNext() ? iterAnio.next() : carpetaProyectos.createFolder(anioStr);
    var iterMes = carpetaAnio.getFoldersByName(mesStr);
    var carpetaMes = iterMes.hasNext() ? iterMes.next() : carpetaAnio.createFolder(mesStr);

    var carpetaProyecto = carpetaMes.createFolder(folio + ' — ' + contrato.nombre_cliente);
    var carpetaControl = carpetaProyecto.createFolder('Control Interno');
    var carpetaEntregables = carpetaProyecto.createFolder('Entregables');
    var carpetaEntregablesId = carpetaEntregables.getId();
    var carpetaUrl = carpetaControl.getUrl();

    // Guardar en PropertiesService y notificar al Worker
    for (var i = 0; i < propiedades.length; i++) {
      var numProp = propiedades[i].num_propiedad || (i + 1);
      props.setProperty('carpeta_' + token + '_' + numProp, carpetaControl.getId());
    }
    for (var pi = 0; pi < propiedades.length; pi++) {
      var numPropD1 = propiedades[pi].num_propiedad || (pi + 1);
      try {
        UrlFetchApp.fetch(CONFIG.WORKER_URL + '/api/actualizarCarpeta', {
          method: 'post', contentType: 'application/json',
          headers: { 'X-Admin-Key': CONFIG.ADMIN_KEY },
          payload: JSON.stringify({ token: token, numPropiedad: numPropD1,
            carpetaControlId: carpetaControl.getId(), carpetaEntregablesId: carpetaEntregablesId })
        });
      } catch (e) { console.error('Error actualizarCarpeta prop ' + numPropD1 + ':', e.message); }
    }

    // PDF referencias y evento Calendar por propiedad
    for (var j = 0; j < propiedades.length; j++) {
      var prop = propiedades[j];
      var urlPDF = '';
      try { urlPDF = generarPDFReferencias4_(contrato, prop, carpetaControl, folio) || ''; }
      catch (e) { console.error('Error PDF refs prop ' + (prop.num_propiedad || j + 1) + ':', e.message); }

      if (!prop.fecha_sesion) continue;
      try {
        var fechaEv = parseFecha_(prop.fecha_sesion);
        var partes = (prop.hora_sesion || '09:00').split(':');
        fechaEv.setHours(parseInt(partes[0]), parseInt(partes[1] || 0), 0);
        var fin = new Date(fechaEv.getTime() + 2 * 3600 * 1000);
        var de = {}; try { de = JSON.parse(prop.datos_especificos || '{}'); } catch(e) {}
        var mapsOk = limpiarLinkMaps_(prop.link_maps);
        var descripcion = [
          (prop.tipo || '') + (prop.paquete ? ' — ' + prop.paquete : ''),
          prop.direccion  ? 'Dirección: '   + prop.direccion  : '',
          mapsOk          ? 'Mapa: '        + mapsOk          : '',
          prop.referencias ? 'Cómo llegar: ' + prop.referencias : '',
          'Portal de equipo: https://contratos.inmueblesaudiovisuales.com/equipo.html?token=' + token,
        ].filter(Boolean).join('\n');
        var titulo = folio + ' IA ' + contrato.nombre_cliente + ' — ' + (prop.paquete || contrato.paquete_base || '');
        var evento = CalendarApp.getDefaultCalendar().createEvent(titulo, fechaEv, fin,
          { description: descripcion, location: mapsOk || prop.direccion || '' });
        props.setProperty('cal_' + token + '_' + prop.num_propiedad, evento.getId());
        try {
          UrlFetchApp.fetch(CONFIG.WORKER_URL + '/api/actualizarCalendarEvent', {
            method: 'post', contentType: 'application/json',
            headers: { 'X-Admin-Key': CONFIG.ADMIN_KEY },
            payload: JSON.stringify({ token: token, numPropiedad: prop.num_propiedad || (j + 1), calendarEventId: evento.getId() })
          });
        } catch (e) { console.error('Error actualizarCalendarEvent prop ' + (prop.num_propiedad || j + 1) + ':', e.message); }
      } catch (e) { console.error('Error Calendar prop ' + (prop.num_propiedad || j + 1) + ':', e.message); }
    }
  } catch (e) {
    console.error('Error creando carpetas en firma:', e.message);
  }
}

// Trigger: ejecutar manualmente o instalar como trigger por minuto
function procesarPDFsPendientes() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var inicio = Date.now();

  for (var key in todas) {
    if (!key.startsWith('pendiente_pdf_')) continue;
    if (Date.now() - inicio > 240000) break; // 4 minutos máximo

    var datos;
    try { datos = JSON.parse(todas[key]); } catch(e) { continue; }

    try {
      var firma = DriveApp.getFileById(datos.firmaId);
      // Si ya se generó el PDF en un intento anterior, reutilizar la URL guardada
      var pdfUrl = datos._pdfUrl || generarPDF_(datos.contrato, firma, datos.propiedades || [], datos.entregables || '');
      if (!datos._pdfUrl && pdfUrl) {
        // Guardar la URL antes de intentar el correo para no regenerar si falla el envío
        datos._pdfUrl = pdfUrl;
        props.setProperty(key, JSON.stringify(datos));
      }
      enviarCorreoConPDF_(datos.contrato, datos.linkPortal, pdfUrl);
      props.deleteProperty(key);
      if (datos.contrato.correo_cliente) firma.setTrashed(true);
    } catch (e) {
      console.error('Error procesando PDF para ' + datos.token + ':', e.message);
    }
  }
}

function generarPDF_(contrato, firmaFile, propiedades, entregables) {
  if (!contrato) return null;
  var doc = DriveApp.getFileById(CONFIG.TEMPLATE_CONTRATO_ID).makeCopy(
    'Contrato — ' + (contrato.folio || contrato.token)
  );
  var docEdit = DocumentApp.openById(doc.getId());
  var body = docEdit.getBody();

  var adicionalesTexto = '';
  try {
    var adicArr = typeof contrato.adicionales_json === 'string'
      ? JSON.parse(contrato.adicionales_json || '[]')
      : (contrato.adicionales_json || []);
    var nombres = [];
    adicArr.forEach(function(a) {
      if (typeof a === 'object') {
        nombres.push(a.nombre || a.clave || '');
      } else if (typeof a === 'string') {
        nombres.push(a);
      }
    });
    adicionalesTexto = nombres.filter(Boolean).length > 0
      ? nombres.filter(Boolean).join(', ')
      : 'Ninguno';
  } catch(e) { adicionalesTexto = 'Ninguno'; }

  var prop1 = (propiedades && propiedades.length > 0) ? propiedades[0] : {};
  var fechaSesionTexto = prop1.fecha_sesion
    ? (prop1.fecha_sesion + (prop1.hora_sesion ? ' ' + prop1.hora_sesion : ''))
    : '';
  var direccionTexto = prop1.direccion || '';

  var reemplazos = {
    '{{folio}}': contrato.folio || '',
    '{{fechaContrato}}': new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
    '{{nombre}}': contrato.nombre_cliente || '',
    '{{correo}}': contrato.correo_cliente || '',
    '{{telefono}}': contrato.telefono_cliente || '',
    '{{paquete}}': contrato.paquete_base || '',
    '{{adicionales}}': adicionalesTexto,
    '{{entregables}}': (entregables || '').replace(/\\n/g, ', ').replace(/\|/g, ', '),
    '{{fechaSesion}}': fechaSesionTexto,
    '{{direccion}}': direccionTexto,
    '{{precioTotal}}': '$' + (contrato.precio_total || 0).toLocaleString('es-MX') + ' MXN',
    '{{anticipo}}': '$' + (contrato.anticipo || 0).toLocaleString('es-MX') + ' MXN',
    '{{saldoPendiente}}': '$' + (contrato.saldo_pendiente || 0).toLocaleString('es-MX') + ' MXN'
  };

  for (var k in reemplazos) body.replaceText(k, reemplazos[k]);

  // Insertar firma en el documento
  if (firmaFile) {
    try {
      var firmaPlaceholder = body.findText('{{firma}}');
      if (firmaPlaceholder) {
        var firmaElement = firmaPlaceholder.getElement();
        var firmaParent = firmaElement.getParent();
        var firmaIdx = firmaParent.getChildIndex(firmaElement);
        firmaElement.asText().setText('');
        var firmaBlob = firmaFile.getBlob();
        var img = firmaParent.insertImage(firmaIdx + 1, firmaBlob);
        img.setWidth(180).setHeight(60);
      } else {
        // Fallback: append al final si no hay placeholder
        body.appendParagraph('');
        body.appendImage(firmaFile.getBlob()).setWidth(180).setHeight(60);
      }
    } catch (e) {
      console.error('Error insertando firma en PDF:', e.message);
    }
  }

  docEdit.saveAndClose();

  var pdf = doc.getAs('application/pdf');
  var carpeta = obtenerOCrearCarpetaContratosFirmados_();
  var archPDF = carpeta.createFile(pdf);
  archPDF.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  doc.setTrashed(true);

  // Notificar al Worker para actualizar pdf_contrato_url en D1
  try {
    UrlFetchApp.fetch(CONFIG.WORKER_URL + '/api/actualizarPdfUrl', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Admin-Key': CONFIG.ADMIN_KEY },
      payload: JSON.stringify({
        token: contrato.token,
        pdfUrl: archPDF.getUrl(),
      })
    });
  } catch (e) {
    console.error('No se pudo actualizar pdfUrl en D1:', e.message);
  }

  return archPDF.getUrl();
}

function enviarCorreoConPDF_(contrato, linkPortal, pdfUrl) {
  if (!contrato.correo_cliente) return;
    var porcentaje = (contrato.precio_total && contrato.precio_total > 0)
      ? Math.round((contrato.anticipo || 0) / contrato.precio_total * 100) : 0;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + contrato.nombre_cliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Gracias por firmar tu contrato. Adjunto encontrarás tu copia en PDF.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Anticipo acordado (' + porcentaje + '%)</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#C9A84C">$' + (contrato.anticipo || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Saldo pendiente</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#1C1C1E">$' + (contrato.saldo_pendiente || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '</table>';
  var html = htmlCorreo_('Contrato firmado', cuerpo, 'Ver estado de tu contrato', linkPortal);
  GmailApp.sendEmail(
    contrato.correo_cliente,
    'Tu contrato firmado — ' + (contrato.folio || ''),
    'Hola ' + contrato.nombre_cliente + ', adjunto tu contrato. Ver portal: ' + linkPortal,
    { htmlBody: html, attachments: [UrlFetchApp.fetch(pdfUrl).getBlob().setName('Contrato-' + (contrato.folio || '') + '.pdf')] }
  );
}

// ── PRIMER ABONO — Drive + Calendar ─────────────────────────────────────────

function primerAbono(body) {
  var token = body.token;
  var contrato = body.contrato;
  var propiedades = body.propiedades;
  var folio = body.folio;

  var carpetaProyectos = DriveApp.getFolderById(CONFIG.CARPETA_PROYECTOS_ID);

  // Año y mes basados en la fecha de sesión (no en hoy)
  var nombresMes = ['01. Enero','02. Febrero','03. Marzo','04. Abril','05. Mayo','06. Junio',
                    '07. Julio','08. Agosto','09. Septiembre','10. Octubre','11. Noviembre','12. Diciembre'];
  var fechaRef = (propiedades.length > 0 && propiedades[0].fecha_sesion)
    ? parseFecha_(propiedades[0].fecha_sesion) : new Date();
  var anioStr = fechaRef.getFullYear().toString();
  var mesStr = nombresMes[fechaRef.getMonth()];
  var carpetaAnio;
  var iterAnio = carpetaProyectos.getFoldersByName(anioStr);
  carpetaAnio = iterAnio.hasNext() ? iterAnio.next() : carpetaProyectos.createFolder(anioStr);
  var carpetaMes;
  var iterMes = carpetaAnio.getFoldersByName(mesStr);
  carpetaMes = iterMes.hasNext() ? iterMes.next() : carpetaAnio.createFolder(mesStr);

  var nombreCarpeta = (folio || token) + ' — ' + contrato.nombre_cliente;
  var carpetaProyecto = carpetaMes.createFolder(nombreCarpeta);
  var carpetaControl = carpetaProyecto.createFolder('Control Interno');
  var carpetaEntregables = carpetaProyecto.createFolder('Entregables');
  var carpetaEntregablesId = carpetaEntregables.getId();

  var props = PropertiesService.getScriptProperties();

  // Guardar carpeta de control para todas las propiedades (subir archivos funciona para cualquiera)
  for (var i = 0; i < propiedades.length; i++) {
    var numProp = propiedades[i].num_propiedad || (i + 1);
    props.setProperty('carpeta_' + token + '_' + numProp, carpetaControl.getId());
  }

  // Notificar al Worker para actualizar carpeta_control_id y carpeta_entregables_id en D1 — todas las propiedades
  for (var pi = 0; pi < propiedades.length; pi++) {
    var numPropD1 = propiedades[pi].num_propiedad || (pi + 1);
    try {
      UrlFetchApp.fetch(CONFIG.WORKER_URL + '/api/actualizarCarpeta', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Admin-Key': CONFIG.ADMIN_KEY },
        payload: JSON.stringify({
          token: token,
          numPropiedad: numPropD1,
          carpetaControlId: carpetaControl.getId(),
          carpetaEntregablesId: carpetaEntregablesId
        })
      });
    } catch (e) {
      console.error('No se pudo actualizar carpeta prop ' + numPropD1 + ':', e.message);
    }
  }

  // Generar PDF de referencias y crear evento Calendar por cada propiedad
  var carpetaUrl = carpetaControl.getUrl();
  for (var j = 0; j < propiedades.length; j++) {
    var prop = propiedades[j];

    // PDF de referencias
    var urlPDF = '';
    try {
      urlPDF = generarPDFReferencias4_(contrato, prop, carpetaControl, folio) || '';
    } catch (e) {
      console.error('Error generando PDF referencias prop ' + (prop.num_propiedad || j + 1) + ':', e.message);
    }

    // Evento Calendar
    if (!prop.fecha_sesion) continue;
    try {
      var fecha = parseFecha_(prop.fecha_sesion);
      var partes = (prop.hora_sesion || '09:00').split(':');
      fecha.setHours(parseInt(partes[0]), parseInt(partes[1] || 0), 0);
      var fin = new Date(fecha.getTime() + 2 * 3600 * 1000);

      var de = {};
      try { de = JSON.parse(prop.datos_especificos || '{}'); } catch(e) {}
      var mapsOk = limpiarLinkMaps_(prop.link_maps);

      var descripcion = [
        (prop.tipo || '') + (prop.paquete ? ' — ' + prop.paquete : ''),
        prop.direccion   ? 'Dirección: '    + prop.direccion   : '',
        mapsOk           ? 'Mapa: '         + mapsOk           : '',
        prop.referencias ? 'Cómo llegar: '  + prop.referencias : '',
        'Portal de equipo: https://contratos.inmueblesaudiovisuales.com/equipo.html?token=' + token,
      ].filter(Boolean).join('\n');

      var titulo = (folio || token) + ' IA ' + contrato.nombre_cliente + ' — ' + (prop.paquete || contrato.paquete_base || '');

      var evento = CalendarApp.getDefaultCalendar().createEvent(titulo, fecha, fin, {
        description: descripcion,
        location: mapsOk || prop.direccion || '',
      });
      props.setProperty('cal_' + token + '_' + prop.num_propiedad, evento.getId());

      try {
        UrlFetchApp.fetch(CONFIG.WORKER_URL + '/api/actualizarCalendarEvent', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'X-Admin-Key': CONFIG.ADMIN_KEY },
          payload: JSON.stringify({
            token: token,
            numPropiedad: prop.num_propiedad || (j + 1),
            calendarEventId: evento.getId()
          })
        });
      } catch (e) {
        console.error('No se pudo guardar calendar_event_id prop ' + (prop.num_propiedad || j + 1) + ':', e.message);
      }
    } catch (e) {
      console.error('Error creando evento Calendar:', e.message);
    }
  }
}

// ── PDF REFERENCIAS ──────────────────────────────────────────────────────────

function generarPDFReferencias4_(contrato, prop, carpetaControl, folio) {
  var esTerreno = (prop.tipo || '').toLowerCase() === 'terreno';
  var folioLabel = folio || contrato.token;
  var nombreDoc = folioLabel + ' IAV ' + contrato.nombre_cliente + ' - Referencias';

  var de = {};
  try { de = JSON.parse(prop.datos_especificos || '{}'); } catch(e) {}

  var fechaStr = '—';
  var horaStr = prop.hora_sesion || '—';
  if (prop.fecha_sesion) {
    try {
      var fechaObj = parseFecha_(prop.fecha_sesion);
      if (!isNaN(fechaObj)) {
        var dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
        var mesesN = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        fechaStr = dias[fechaObj.getDay()] + ' ' + fechaObj.getDate() + ' de ' + mesesN[fechaObj.getMonth()] + ' ' + fechaObj.getFullYear();
      }
    } catch(e) {}
  }

  var doc = DocumentApp.create(nombreDoc);
  var body = doc.getBody();
  body.clear();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(60).setMarginRight(60);

  function lv(label, value) {
    if (!value) return;
    var lp = body.appendParagraph(label);
    lp.setSpacingBefore(6).setSpacingAfter(0);
    lp.editAsText().setBold(true).setFontSize(8).setForegroundColor('#888888');
    var vp = body.appendParagraph(String(value));
    vp.setSpacingBefore(0).setSpacingAfter(0);
    vp.editAsText().setFontSize(10).setForegroundColor('#1C1C1E');
  }

  function sec(title) {
    var p = body.appendParagraph(title);
    p.setSpacingBefore(16).setSpacingAfter(4);
    p.editAsText().setBold(true).setFontSize(9).setForegroundColor('#C9A84C');
  }

  var t1 = body.appendParagraph('INMUEBLES AUDIOVISUALES');
  t1.setSpacingBefore(0).setSpacingAfter(2);
  t1.editAsText().setBold(true).setFontSize(16).setForegroundColor('#1C1C1E');

  var t2 = body.appendParagraph('Hoja de Referencias · ' + folioLabel);
  t2.setSpacingBefore(0).setSpacingAfter(14);
  t2.editAsText().setFontSize(11).setForegroundColor('#C9A84C');

  sec('CLIENTE');
  lv('Nombre', contrato.nombre_cliente);
  lv('Teléfono', contrato.telefono_cliente);
  lv('Correo', contrato.correo_cliente);

  sec('SESIÓN');
  lv('Paquete', prop.paquete);
  lv('Tipo de propiedad', prop.tipo);
  lv('Fecha de sesión', fechaStr);
  lv('Hora', horaStr);
  lv('Entregables', prop.entregables);

  sec('UBICACIÓN');
  lv('Dirección', prop.direccion);
  lv('Enlace de Maps', limpiarLinkMaps_(prop.link_maps));
  lv('Cómo llegar', prop.referencias);
  lv('Foto de fachada', prop.fachada_url);
  lv('Perímetro', prop.perimetro_url);
  lv('Orientación del video', prop.orientacion ? prop.orientacion.split(' — ')[0] : '');

  if (prop.sobre_la_propiedad) {
    sec(esTerreno ? 'SOBRE EL TERRENO' : 'SOBRE LA PROPIEDAD');
    var sp = body.appendParagraph(prop.sobre_la_propiedad);
    sp.setSpacingBefore(4).setSpacingAfter(0);
    sp.editAsText().setFontSize(10).setForegroundColor('#333333');
  }

  if (esTerreno && (de.accesoTerreno || de.orientacionFrente)) {
    sec('ACCESO Y FRENTE');
    lv('Acceso al terreno', de.accesoTerreno);
    lv('Orientación del frente', de.orientacionFrente);
  }

  if (de.comentarios) {
    sec('NOTAS');
    lv('Comentarios adicionales', de.comentarios);
  }

  doc.saveAndClose();

  try {
    var pdfBlob = DriveApp.getFileById(doc.getId())
      .getAs('application/pdf')
      .setName(nombreDoc + '.pdf');
    var pdfFile = carpetaControl.createFile(pdfBlob);
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    return pdfFile.getUrl();
  } catch (e) {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch(e2) {}
    throw e;
  }
}

// ── CORREOS ──────────────────────────────────────────────────────────────────

function enviarCorreoAbono(body) {
  if (!body.correoCliente) return;
  var esPrimero = !!body.esPrimerAbono;
  var totalPagado = Math.max(0, (body.precioTotal || 0) - (body.nuevoSaldo || 0));
  var metodoLabel = body.metodo || 'Transferencia';
  var saldoColor = (body.nuevoSaldo || 0) === 0 ? '#C9A84C' : '#1C1C1E';

  var intro = esPrimero
    ? '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 24px">Hola <strong>' + body.nombreCliente + '</strong>, recibimos tu pago. Tu fecha queda confirmada.</p>'
    : '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 24px">Hola <strong>' + body.nombreCliente + '</strong>, confirmamos la recepción de tu pago.</p>';

  var cuerpo = intro +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E5EA;margin-bottom:24px">' +
    '<tr><td style="padding:11px 0;font-size:14px;color:#6B6B6F;border-bottom:1px solid #E5E5EA">' + metodoLabel + '</td>' +
    '<td align="right" style="padding:11px 0;font-size:14px;font-weight:700;color:#C9A84C;border-bottom:1px solid #E5E5EA">$' + (body.monto || 0).toLocaleString('es-MX') + '</td></tr>' +
    '<tr><td style="padding:11px 0;font-size:14px;color:#6B6B6F;border-bottom:1px solid #E5E5EA">Total pagado</td>' +
    '<td align="right" style="padding:11px 0;font-size:14px;font-weight:700;color:#1C1C1E;border-bottom:1px solid #E5E5EA">$' + totalPagado.toLocaleString('es-MX') + '</td></tr>' +
    '<tr><td style="padding:11px 0;font-size:14px;color:#6B6B6F;border-bottom:1px solid #E5E5EA">Saldo pendiente</td>' +
    '<td align="right" style="padding:11px 0;font-size:14px;font-weight:700;color:' + saldoColor + ';border-bottom:1px solid #E5E5EA">$' + (body.nuevoSaldo || 0).toLocaleString('es-MX') + '</td></tr>' +
    '</table>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0">Cualquier duda, <a href="' + CONFIG.WHATSAPP + '" style="color:#C9A84C;font-weight:700;text-decoration:none">contáctanos por WhatsApp</a>.</p>';

  var tituloEmail = esPrimero ? 'Tu sesión está apartada, ' + body.nombreCliente + '.' : 'Confirmación de pago';
  var asunto = esPrimero
    ? 'Tu sesión está apartada — ' + (body.folio || '')
    : 'Confirmación de pago — ' + (body.folio || '');

  var html = htmlCorreo_(tituloEmail, cuerpo, 'VER MI COMPROBANTE', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    asunto,
    'Hola ' + body.nombreCliente + ', confirmamos tu pago de $' + (body.monto || 0).toLocaleString('es-MX') + ' MXN.',
    { htmlBody: html }
  );
}

function enviarCorreoEntrega(body) {
  if (!body.correoCliente) return;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + body.nombreCliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Tu material audiovisual ya está disponible para descarga. Puedes acceder desde el portal de tu contrato.</p>';
  var html = htmlCorreo_('Tu material está listo', cuerpo, 'Descargar material', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    'Tu material está listo — ' + (body.folio || ''),
    'Hola ' + body.nombreCliente + ', tu material está listo. Descárgalo en: ' + body.linkPortal,
    { htmlBody: html }
  );
}

function notificarResena(body) {
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Calificación: <strong>' + (body.calificacion || '?') + '/5 estrellas</strong></p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px;white-space:pre-wrap">' + (body.resenaTexto || 'Sin comentario escrito.') + '</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Token</td>' +
    '<td align="right" style="font-size:12px;font-weight:700;color:#1C1C1E;font-family:monospace">' + (body.token || '—') + '</td></tr>' +
    '</table>';
  var html = htmlCorreo_('Nueva reseña (' + (body.calificacion || '?') + '/5)', cuerpo, '', '');
  GmailApp.sendEmail(
    CONFIG.EMAIL_BRUNO,
    'Nueva reseña — ' + (body.calificacion || '?') + '/5 estrellas',
    'Calificación: ' + (body.calificacion || '?') + '/5\n\n' + (body.resenaTexto || ''),
    { htmlBody: html }
  );
}

function notificarRevision(body) {
  var filas = '';
  var revisiones = body.revisiones || [];
  revisiones.forEach(function(r, i) {
    var minuto = (r.minuto_segundo || '—').trim();
    var desc   = (r.descripcion_ajuste || '').trim();
    if (!desc) return;
    filas += '<tr style="border-bottom:1px solid #E5E3DE">' +
      '<td style="padding:10px 12px;font-size:13px;color:#9B9B9F;white-space:nowrap;vertical-align:top">' + minuto + '</td>' +
      '<td style="padding:10px 12px;font-size:13px;color:#1C1C1E;line-height:1.5;vertical-align:top">' + desc + '</td></tr>';
  });
  var tabla = revisiones.length
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E3DE;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px">' +
      '<thead><tr style="background:#F9F7F4"><th align="left" style="padding:10px 12px;font-size:12px;color:#9B9B9F;font-weight:600">TIMECODE</th>' +
      '<th align="left" style="padding:10px 12px;font-size:12px;color:#9B9B9F;font-weight:600">NOTA DE AJUSTE</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table>'
    : '<p style="color:#9B9B9F;font-size:13px">Sin notas enviadas.</p>';

  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 4px"><strong>' + (body.nombreCliente || 'Cliente') + '</strong> envió notas de revisión</p>' +
    '<p style="color:#9B9B9F;font-size:12px;margin:0 0 20px">Folio: ' + (body.folio || '—') + '</p>' +
    tabla;
  var html = htmlCorreo_('Revisión de video', cuerpo, '', '');
  GmailApp.sendEmail(
    CONFIG.EMAIL_BRUNO,
    'Revisión de video — ' + (body.nombreCliente || '') + ' (' + (body.folio || '') + ')',
    revisiones.map(function(r) { return (r.minuto_segundo || '—') + ': ' + (r.descripcion_ajuste || ''); }).join('\n'),
    { htmlBody: html }
  );
}

function enviarRecordatorioPago(body) {
  if (!body.correoCliente) return;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + body.nombreCliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Te recordamos que tienes un saldo pendiente.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Saldo pendiente</td>' +
    '<td align="right" style="font-size:14px;font-weight:700;color:#C9A84C">$' + (body.saldoPendiente || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '</table>';
  var html = htmlCorreo_('Recordatorio de pago', cuerpo, 'Realizar pago', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    'Recordatorio de pago — ' + (body.folio || ''),
    'Hola ' + body.nombreCliente + ', saldo pendiente: $' + (body.saldoPendiente || 0).toLocaleString('es-MX') + ' MXN. Portal: ' + body.linkPortal,
    { htmlBody: html }
  );
}

function notificarUpsell(body) {
  if (!body.correoCliente) return;
  var servicios = [];
  if (body.agregarAdicionales && body.agregarAdicionales.length) {
    servicios = servicios.concat(body.agregarAdicionales.map(function(c) { return 'Adicional: ' + c; }));
  }
  if (body.serviciosLibres && body.serviciosLibres.length) {
    servicios = servicios.concat(body.serviciosLibres.map(function(s) { return s.nombre + ' (+$' + s.precio + ')'; }));
  }
  var serviciosHtml = servicios.length
    ? '<ul style="margin:0 0 16px;padding-left:20px;color:#3A3A3C;font-size:13px;line-height:1.8">' +
      servicios.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul>'
    : '';
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + body.nombreCliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Se han añadido servicios adicionales a tu contrato.</p>' +
    serviciosHtml +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Nuevo total</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#C9A84C">$' + (body.precioFinal || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Saldo pendiente</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#1C1C1E">$' + (body.saldoNuevo || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '</table>';
  var html = htmlCorreo_('Servicios actualizados', cuerpo, 'Ver estado de tu contrato', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    'Servicios actualizados — ' + (body.folio || ''),
    'Hola ' + body.nombreCliente + ', tu contrato fue actualizado. Nuevo total: $' + (body.precioFinal || 0).toLocaleString('es-MX') + ' MXN.',
    { htmlBody: html }
  );
}

// ── REAGENDAR ────────────────────────────────────────────────────────────────

function reagendarPropiedad(body) {
  var token = body.token;
  var numPropiedad = body.numPropiedad;
  if (!numPropiedad) return { error: 'numPropiedad requerido' };
  var contrato = body.contrato;
  var propiedad = body.propiedad;

  var props = PropertiesService.getScriptProperties();
  var calId = props.getProperty('cal_' + token + '_' + numPropiedad)
    || (body.propiedad && body.propiedad.calendar_event_id)
    || null;

  var nombresMesR = ['01. Enero','02. Febrero','03. Marzo','04. Abril','05. Mayo','06. Junio',
                     '07. Julio','08. Agosto','09. Septiembre','10. Octubre','11. Noviembre','12. Diciembre'];
  var urlPDFNuevo = '';

  // Mover carpeta al mes correcto, renombrar y regenerar PDF referencias
  if (propiedad.carpeta_control_id) {
    try {
      var carpetaControl = DriveApp.getFolderById(propiedad.carpeta_control_id);
      var carpetaProyecto = carpetaControl.getParents().next();

      // Renombrar carpeta proyecto con nuevo folio
      var nuevoNombreCarpeta = body.folioNuevo + ' — ' + contrato.nombre_cliente;
      carpetaProyecto.setName(nuevoNombreCarpeta);

      // Mover al mes/año correcto según la nueva fecha
      var nuevaFechaObj = parseFecha_(body.fecha);
      var nuevoAnioStr = nuevaFechaObj.getFullYear().toString();
      var nuevoMesStr = nombresMesR[nuevaFechaObj.getMonth()];
      var carpetaMesActual = carpetaProyecto.getParents().next();
      var carpetaAnioActual = carpetaMesActual.getParents().next();
      var carpetaProyectos = carpetaAnioActual.getParents().next();

      var iterNuevoAnio = carpetaProyectos.getFoldersByName(nuevoAnioStr);
      var carpetaNuevoAnio = iterNuevoAnio.hasNext() ? iterNuevoAnio.next() : carpetaProyectos.createFolder(nuevoAnioStr);
      var iterNuevoMes = carpetaNuevoAnio.getFoldersByName(nuevoMesStr);
      var carpetaNuevoMes = iterNuevoMes.hasNext() ? iterNuevoMes.next() : carpetaNuevoAnio.createFolder(nuevoMesStr);

      if (carpetaMesActual.getId() !== carpetaNuevoMes.getId()) {
        carpetaProyecto.moveTo(carpetaNuevoMes);
      }

      // Borrar PDF de referencias anterior y regenerar con nuevo folio
      if (body.folioAnterior) {
        var archivos = carpetaControl.getFiles();
        while (archivos.hasNext()) {
          var arch = archivos.next();
          if (arch.getName().indexOf(body.folioAnterior + ' IAV') === 0) {
            arch.setTrashed(true);
          }
        }
      }
      var propActualizada = JSON.parse(JSON.stringify(propiedad));
      propActualizada.fecha_sesion = body.fecha;
      propActualizada.hora_sesion = body.hora || propiedad.hora_sesion;
      try {
        urlPDFNuevo = generarPDFReferencias4_(
          contrato, propActualizada, carpetaControl, body.folioNuevo
        ) || '';
      } catch (e) { console.error('Error regenerando PDF refs:', e.message); }

    } catch (e) {
      console.error('Error actualizando carpeta Drive:', e.message);
    }
  }

  // Actualizar evento Calendar: fecha, título y descripción
  if (calId) {
    try {
      var evento = CalendarApp.getEventById(calId);
      if (evento) {
        var nuevaFecha = parseFecha_(body.fecha);
        var partes = (body.hora || '09:00').split(':');
        nuevaFecha.setHours(parseInt(partes[0]), parseInt(partes[1] || 0), 0);
        var fin = new Date(nuevaFecha.getTime() + 2 * 3600 * 1000);
        evento.setTime(nuevaFecha, fin);
        evento.setTitle(body.folioNuevo + ' IA ' + contrato.nombre_cliente + ' — ' + (propiedad.paquete || contrato.paquete_base || ''));
        var de = {}; try { de = JSON.parse(propiedad.datos_especificos || '{}'); } catch(e) {}
        var mapsOkR = limpiarLinkMaps_(propiedad.link_maps);
        var nuevaDescripcion = [
          (propiedad.tipo || '') + (propiedad.paquete ? ' — ' + propiedad.paquete : ''),
          propiedad.direccion   ? 'Dirección: '    + propiedad.direccion   : '',
          mapsOkR               ? 'Mapa: '         + mapsOkR               : '',
          propiedad.referencias ? 'Cómo llegar: '  + propiedad.referencias : '',
          'Portal de equipo: https://contratos.inmueblesaudiovisuales.com/equipo.html?token=' + token,
        ].filter(Boolean).join('\n');
        evento.setDescription(nuevaDescripcion);
      }
    } catch (e) {
      console.error('Error actualizando evento Calendar:', e.message);
    }
  }

  // Actualizar calendar_event_id en D1 si está disponible
  if (calId) {
    try {
      UrlFetchApp.fetch(CONFIG.WORKER_URL + '/api/actualizarCalendarEvent', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Admin-Key': CONFIG.ADMIN_KEY },
        payload: JSON.stringify({
          token: token,
          numPropiedad: numPropiedad,
          calendarEventId: calId
        })
      });
    } catch (e) {
      console.error('No se pudo actualizar calendar_event_id en D1:', e.message);
    }
  }

  if (contrato.correo_cliente) {
    var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + contrato.nombre_cliente + '</strong>,</p>' +
      '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Tu sesión ha sido reagendada.</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
      '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Nueva fecha</td>' +
      '<td align="right" style="font-size:13px;font-weight:700;color:#1C1C1E">' + body.fecha + (body.hora ? ' · ' + body.hora : '') + '</td></tr>' +
      '</table>';
    var linkPortal = 'https://contratos.inmueblesaudiovisuales.com/portal.html?token=' + (body.token || token);
    var html = htmlCorreo_('Sesión reagendada', cuerpo, 'Ver portal', linkPortal);
    GmailApp.sendEmail(
      contrato.correo_cliente,
      'Reagendamiento de sesión — ' + (contrato.folio || ''),
      'Hola ' + contrato.nombre_cliente + ', tu sesión fue reagendada para ' + body.fecha + (body.hora ? ' a las ' + body.hora : '') + '.',
      { htmlBody: html }
    );
  }
}

// ── ARCHIVOS ─────────────────────────────────────────────────────────────────

function subirArchivo(body) {
  var props = PropertiesService.getScriptProperties();
  var carpetaId = props.getProperty('carpeta_' + body.token + '_' + (body.numPropiedad || 1));
  if (!carpetaId) return { error: 'Carpeta no encontrada. Registra el primer abono primero.' };
  var carpeta = DriveApp.getFolderById(carpetaId);
  var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), body.mimeType, body.nombre);
  var archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: archivo.getUrl() };
}

function subirArchivoAdmin(body) {
  var carpeta = DriveApp.getFolderById(body.carpetaId);
  var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), body.mimeType, body.nombre);
  var archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: archivo.getUrl() };
}

// ── SYNC BACKUP — sobreescribe Sheets con snapshot de D1 ────────────────────

function syncBackup(body) {
  var data = body.data;
  var ss = SpreadsheetApp.openById(CONFIG.SHEETS_BACKUP_ID);

  function syncHoja(nombreHoja, filas, headers) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) hoja = ss.insertSheet(nombreHoja);
    hoja.clearContents();
    if (!filas || filas.length === 0) {
      hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
      return;
    }
    var rows = [headers].concat(filas.map(function(r) {
      return headers.map(function(h) { return r[h] !== undefined && r[h] !== null ? r[h] : ''; });
    }));
    hoja.getRange(1, 1, rows.length, headers.length).setValues(rows);
  }

  syncHoja('Contratos4', data.contratos, [
    'token','folio','nombre_cliente','correo_cliente','telefono_cliente',
    'tipo_contrato','tipo_paquete','paquete_base','precio_total','anticipo',
    'saldo_pendiente','estatus','fecha_creacion','fecha_firma','fecha_entrega','oculto'
  ]);
  syncHoja('Abonos4', data.abonos, [
    'id','contrato_token','monto','metodo','fecha','fecha_registro','notas'
  ]);
  syncHoja('Propiedades4', data.propiedades, [
    'contrato_token','num_propiedad','tipo','paquete','fecha_sesion','hora_sesion','direccion'
  ]);
  syncHoja('Paquetes4', data.paquetes, [
    'clave','tipo','nombre','precio','es_adicional','activo','orden'
  ]);
}

// ── INSTALAR TRIGGERS ─────────────────────────────────────────────────────

function instalarTriggers() {
  // Eliminar triggers existentes para no duplicar
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'procesarPDFsPendientes' ||
        t.getHandlerFunction() === 'deteccionPDFsAtascados') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger cada minuto para procesar PDFs pendientes
  ScriptApp.newTrigger('procesarPDFsPendientes')
    .timeBased().everyMinutes(1).create();

  // Trigger diario 9 AM para detectar PDFs atascados (>1h sin procesar)
  ScriptApp.newTrigger('deteccionPDFsAtascados')
    .timeBased().atHour(9).everyDays(1).create();

  Logger.log('Triggers instalados correctamente en v4.0');
}

// ── DETECCIÓN PDFs ATASCADOS ──────────────────────────────────────────────

function deteccionPDFsAtascados() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var haceUnaHora = Date.now() - 3600000;
  var atascados = 0;

  for (var key in todas) {
    if (!key.startsWith('pendiente_pdf_')) continue;
    try {
      var datos = JSON.parse(todas[key]);
      var creado = (datos._creado || 0);
      if (creado && creado < haceUnaHora) atascados++;
    } catch(e) {}
  }

  if (atascados > 0) {
    var html = htmlCorreo_('PDFs atascados detectados',
      '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0">Hay <strong>' + atascados + '</strong> PDF(s) pendientes que llevan más de 1 hora sin procesar. Revisa el trigger <code>procesarPDFsPendientes</code> en Apps Script.</p>',
      '', '');
    GmailApp.sendEmail(
      CONFIG.EMAIL_BRUNO,
      'AVISO — ' + atascados + ' PDF(s) atascado(s) en v4.0',
      'Hay ' + atascados + ' PDF(s) sin procesar por más de 1 hora.',
      { htmlBody: html }
    );
  }
}

// ── LOGO CLIENTE ──────────────────────────────────────────────────────────

function obtenerLogoCliente(body) {
  var correoCliente = body.correo || '';
  if (!correoCliente) return { logoPrecargadoUrl: null };

  try {
    var correoNorm = correoCliente.toLowerCase().trim().replace(/\+[^@]*@/, '@');
    var carpetaSis = DriveApp.getFolderById(CONFIG.CARPETA_PROYECTOS_ID);
    var iterLogos = carpetaSis.getFoldersByName('Logos');
    if (!iterLogos.hasNext()) return { logoPrecargadoUrl: null };

    var iterCli = iterLogos.next().getFoldersByName(correoNorm);
    var carpetaCliente = null;
    if (iterCli.hasNext()) {
      carpetaCliente = iterCli.next();
    } else {
      // Fallback: buscar con el correo original sin normalizar
      var iterCliOrig = carpetaSis.getFoldersByName('Logos');
      if (iterCliOrig.hasNext()) {
        var iterOrig = iterCliOrig.next().getFoldersByName(correoCliente.trim());
        if (iterOrig.hasNext()) carpetaCliente = iterOrig.next();
      }
    }

    if (carpetaCliente) {
      var iterFiles = carpetaCliente.getFiles();
      if (iterFiles.hasNext()) {
        var logoFile = iterFiles.next();
        return { logoPrecargadoUrl: logoFile.getUrl() };
      }
    }
  } catch(e) {
    console.error('Error buscando logo cliente:', e.message);
  }

  return { logoPrecargadoUrl: null };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function htmlCorreo_(titulo, cuerpoHtml, btnTexto, btnUrl) {
  var btn = btnTexto && btnUrl
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0"><tr>' +
      '<td style="background:#C9A84C;border-radius:8px;text-align:center">' +
      '<a href="' + btnUrl + '" style="color:#fff;text-decoration:none;padding:15px 28px;font-weight:700;font-size:14px;letter-spacing:0.5px;display:block">' + btnTexto + '</a>' +
      '</td></tr></table>'
    : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#F5F4F1;font-family:Helvetica,Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">' +
    '<tr><td style="border-radius:8px 8px 0 0;overflow:hidden">' +
    '<img src="https://inmueblesaudiovisuales.com/email-header.png" width="100%" style="display:block">' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:32px;border-radius:0 0 8px 8px">' +
    '<h2 style="margin:0 0 20px;font-size:20px;color:#1C1C1E;font-weight:700">' + titulo + '</h2>' +
    cuerpoHtml +
    btn +
    '<hr style="border:none;border-top:1px solid #E5E5EA;margin:28px 0 20px">' +
    '<p style="margin:0;font-size:12px;color:#9B9B9F;text-align:center">Inmuebles Audiovisuales · Monterrey, México</p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function parseFecha_(str) {
  if (!str) return new Date();
  if (str.indexOf('T') !== -1) return new Date(str);
  return new Date(str + 'T12:00:00');
}

function limpiarLinkMaps_(url) {
  if (!url) return url;
  var m = url.match(/[?&]q=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return url;
}

function formatearAccesoCalendar_(prop) {
  if (!prop) return '';
  var datos = {};
  try {
    datos = typeof prop.datos_especificos === 'string'
      ? JSON.parse(prop.datos_especificos || '{}')
      : (prop.datos_especificos || {});
  } catch(e) {
    datos = {};
  }
  var acceso = datos && datos.acceso ? datos.acceso : {};
  var requiere = prop.requiere_acceso === 1 || prop.requiere_acceso === true || prop.requiere_acceso === '1';
  var labels = {
    qr: 'QR',
    invitacion_digital: 'Invitación digital',
    codigo: 'Código',
    lista_acceso: 'Lista de acceso',
    registro_previo: 'Registro previo',
    llamada_al_llegar: 'Llamada al llegar',
    otro: 'Otro'
  };
  var puntos = {
    directo_departamento: 'Pasamos directo al departamento',
    lobby: 'Nos vemos en lobby',
    estacionamiento: 'Nos vemos en estacionamiento',
    otro: 'Otro punto'
  };
  var lineas = [];
  if (acceso.metodos && acceso.metodos.length) {
    var metodos = [];
    for (var i = 0; i < acceso.metodos.length; i++) metodos.push(labels[acceso.metodos[i]] || acceso.metodos[i]);
    lineas.push('Método de acceso: ' + metodos.join(', '));
  }
  if (acceso.nombreRegistro) lineas.push('Registro: ' + acceso.nombreRegistro);
  if (acceso.instruccionesCaseta) lineas.push('Caseta: ' + acceso.instruccionesCaseta);
  if (acceso.contactoAccesoTipo === 'yo') lineas.push('Contacto acceso: Cliente');
  if (acceso.contactoAccesoTipo === 'otro' && acceso.contactoAcceso) lineas.push('Contacto acceso: ' + acceso.contactoAcceso);
  if (acceso.tipoEdificio) lineas.push('Tipo acceso: ' + acceso.tipoEdificio);
  if (acceso.torre) lineas.push('Torre: ' + acceso.torre);
  if (acceso.piso) lineas.push('Piso: ' + acceso.piso);
  if (acceso.departamento) lineas.push('Departamento: ' + acceso.departamento);
  if (acceso.estacionamiento) lineas.push('Estacionamiento: ' + acceso.estacionamiento);
  if (acceso.puntoEncuentro) lineas.push('Punto de encuentro: ' + (puntos[acceso.puntoEncuentro] || acceso.puntoEncuentro));
  if (acceso.puntoEncuentroDetalle) lineas.push('Detalle encuentro: ' + acceso.puntoEncuentroDetalle);
  if (acceso.restricciones) lineas.push('Restricciones acceso: ' + acceso.restricciones);
  if (acceso.comentarios) lineas.push('Comentarios acceso: ' + acceso.comentarios);
  if (!lineas.length && requiere) lineas.push('Requiere acceso especial; sin instrucciones adicionales');
  return lineas.length ? 'Acceso y caseta:\n' + lineas.join('\n') : '';
}

function obtenerOCrearCarpetaFirmas_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_FIRMAS_V4_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var carpeta = DriveApp.getRootFolder().createFolder('IAV — Firmas Pendientes v4');
  props.setProperty('CARPETA_FIRMAS_V4_ID', carpeta.getId());
  return carpeta;
}

function obtenerOCrearCarpetaContratosFirmados_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_CONTRATOS_V4_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var carpeta = DriveApp.getRootFolder().createFolder('IAV — Contratos Firmados v4');
  props.setProperty('CARPETA_CONTRATOS_V4_ID', carpeta.getId());
  return carpeta;
}

// ── PROSPECTOS — agenda llamada en Calendar ──────────────────────────────────

function agendarLlamadaProspecto(body) {
  var nombre       = body.nombre || '';
  var telefono     = body.telefono || '';
  var interes      = body.interes || '';
  var fechaLlamada = body.fechaLlamada || '';
  var horaLlamada  = body.horaLlamada || '09:00';
  var notas        = body.notas || '';

  if (!fechaLlamada) return { error: 'fechaLlamada requerida' };

  var partesFecha = fechaLlamada.split('-');
  var partesHora  = horaLlamada.split(':');
  var inicio = new Date(
    parseInt(partesFecha[0]),
    parseInt(partesFecha[1]) - 1,
    parseInt(partesFecha[2]),
    parseInt(partesHora[0]),
    parseInt(partesHora[1] || 0),
    0
  );
  var fin = new Date(inicio.getTime() + 30 * 60 * 1000); // 30 minutos

  var interesLabels = {
    'foto':  'Fotografía',
    'video': 'Video + Drone',
    '360':   'Recorrido 360°',
    'combo': 'Paquete completo'
  };
  var interesLabel = interesLabels[interes] || interes || 'Sin especificar';

  var descripcion = [
    'Llamada con prospecto — IAV Contratos',
    '',
    'Nombre: ' + nombre,
    'Teléfono: ' + telefono,
    'Le interesa: ' + interesLabel,
    notas ? 'Notas: ' + notas : ''
  ].filter(Boolean).join('\n');

  var titulo = 'Llamada prospecto — ' + nombre + ' (' + interesLabel + ')';

  CalendarApp.getDefaultCalendar().createEvent(titulo, inicio, fin, {
    description: descripcion
  });

  return { ok: true };
}
